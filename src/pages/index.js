import * as React from "react"
import DefaultLayout from "../layouts/default";
import {graphql, Link, useStaticQuery} from "gatsby";
import { GatsbyImage, getImage } from "gatsby-plugin-image"

const PostItem = ({title, hero, date, excerpt, timeToRead, slug}) => {
    const image = getImage(hero)

    return (
        <div className="mb-3 px-0 px-sm-2 col-lg-4 col-md-6 col-12">
            <div className="card">
                <GatsbyImage image={image} alt="hero" />
                <div className="card-body">
                    <Link className="fs-5 card-title mb-2 d-block" title={title} to={slug}>{ title }</Link>
                    <h2 className="fs-6 card-subtitle mb-2">{ date }</h2>
                    <h2 className="fs-6 card-subtitle mb-2 text-secondary">Reading time: {timeToRead} minutes</h2>
                    <p className="card-text">{ excerpt }</p>
                    <Link title={title} className="card-link btn btn-primary btn-small" to={slug}>Read more</Link>
                </div>
            </div>
        </div>
    )
}


const Main = () => {
    const query = useStaticQuery(graphql`
        {
          allMarkdownRemark(
            sort: {order: DESC, fields: [frontmatter___date]}
            limit: 1000
          ) {
            edges {
              node {
                frontmatter {
                  title
                  slug
                  date(formatString: "DD-MMM yyyy")
                  hero {
                    childImageSharp {
                      gatsbyImageData(height: 150, width: 430, placeholder: BLURRED)
                    }
                  }
                }
                excerpt(format: PLAIN, pruneLength: 230)
                timeToRead
              }
            }
          }
        }
    `)

    const posts = query.allMarkdownRemark.edges.map(edge => {
        const data = {
            ...edge.node.frontmatter,
            excerpt: edge.node.excerpt,
            timeToRead: edge.node.timeToRead
        }
        return <PostItem key={data.slug} {...data} />
    })

    return <>
        <h1 className="text-decoration-underline fs-1 py-2">Hi, welcome to my programming blog.</h1>
        <div className="fs-4 bg-light rounded p-2">
            <div className="col-xl-8 col-12">
                    I am an engineer that turned software developer.
                    I enjoy technical challenges and experimenting with techniques and architectures.
                    Some are used successfully in production and some are complete failures. However, all experiments are a
                    way of learning. By posting articles about my experiments I hope that others learn from me, but also that
                    I can learn from others. Also, it serves a more mindful approach where, by writing it down, I am forces
                    to structure my thoughts.
            </div>
        </div>
        <h2 className="my-4">Latest posts</h2>
        <div className="lg-container">
            <div className="row gx-3">
                { posts }
            </div>
        </div>
    </>
}

const IndexPage = () => {
    return <DefaultLayout><div className="index"><Main /></div></DefaultLayout>
}

export default IndexPage
