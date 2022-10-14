import * as React from "react"
import DefaultLayout from "../layouts/default";
import {graphql, Link, useStaticQuery} from "gatsby";

const PostItem = ({title, date, excerpt, timeToRead, slug}) => {
    return (
        <div className="post">
            <h2>{ title }</h2>
            <p className="date">{ date }</p>
            <p className="reading-time">Reading time: {timeToRead} minutes</p>
            <p className="excerpt">{ excerpt }</p>
            <Link title={title} className="read-more" to={slug}>Read more</Link>
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
                }
                excerpt(format: PLAIN, pruneLength: 240)
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
        <h1>Hi, welcome to my programming blog.</h1>
        <div>
                I am an engineer that turned software developer.
                I enjoy technical challenges and experimenting with techniques and architectures.
                Some are used successfully in production and some are complete failures. However, all experiments are a
                way of learning. By posting articles about my experiments I hope that others learn from me, but also that
                I can learn from others. Also, it serves a more mindful approach where, by writing it down, I am forced
                to structure my thoughts.
        </div>
        <h1>Latest posts</h1>
        <div className="posts">
            { posts }
        </div>
    </>
}

const IndexPage = () => {
    return <DefaultLayout><div className="index"><Main /></div></DefaultLayout>
}

export default IndexPage
